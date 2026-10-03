/* The static board: terrain, board plates, seams and the city, drawn once per deal into #board (SVG)
   with their text as HTML labels (#blabels): Chrome re-lays out SVG text whenever an ancestor's scale changes, HTML
   text it doesn't. The live layers (targets, blockades, trails: #board2; explorers: #pieces) sit above it. */
import { R, hash } from '../../engine.gen.js';
import { MAP } from '../state.js';
import { layout, xy } from './layout.js';
import { $, sv } from '../dom.js';
export function hexPts(x,y,r){let s='';for(let i=0;i<6;i++){const a=Math.PI/180*(60*i-30);s+=(x+r*Math.cos(a)).toFixed(1)+','+(y+r*Math.sin(a)).toFixed(1)+' ';}return s;}
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

/* board layers other modules draw into (made with the board) */
/* a small picture of a course's map (the menu: course choices, a saved game): every space as a dot in its terrain's
   colour; marks: [{k, color}] explorers drawn on their spaces. w×h: the picture's box (its viewBox) */
export function mapThumb(M,w=160,h=64,marks=[]){
  const hs=[...M.hexes.values()],P=h2=>[R*Math.sqrt(3)*(h2.q+h2.r/2),R*1.5*h2.r];let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const c of hs){const[x,y]=P(c);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  const k=Math.min((w-12)/(x1-x0+2*R),(h-8)/(y1-y0+2*R)),ox=w/2-(x0+x1)/2*k,oy=h/2-(y0+y1)/2*k,r=(R*k*.95).toFixed(2);
  const col=c=>{const t=c.type==='g'?(c.sym||'g'):c.type;return TSHADE[t]?TSHADE[t][Math.min(3,Math.max(0,(c.val||1)-1))][0]:TFILL[t]?TFILL[t][0]:'#777';};
  const at=c=>{const[x,y]=P(c);return[(x*k+ox).toFixed(1),(y*k+oy).toFixed(1)];};
  return`<svg viewBox="0 0 ${w} ${h}" aria-hidden="true">${hs.map(c=>{const[x,y]=at(c);return`<circle cx="${x}" cy="${y}" r="${r}" fill="${col(c)}"/>`;}).join('')}`
    +marks.map(m=>{const c=M.hexes.get(m.k);if(!c)return'';const[x,y]=at(c);return`<circle cx="${x}" cy="${y}" r="${(R*k*1.6).toFixed(2)}" fill="${m.color}" stroke="#0b1411" stroke-width="1.4"/>`;}).join('')+'</svg>';
}
export const L={};
/* the overlay layers (highlights, trail, path, blockades), on #board2: made at startup and again with each board drawn, so
   anything that draws on them (the recap's trail, the targets) never depends on a board having been drawn first */
export function boardLayers(){const svg2=$('#board2');svg2.innerHTML='';
  L.hl=sv('g',null,svg2);L.trail=sv('g',{'pointer-events':'none'},svg2);L.path=sv('g',{'pointer-events':'none'},svg2);L.bl=sv('g',null,svg2);}
/* HTML text at a board point: size in board units, anchor start / middle / end, baseline at y (like SVG text) */
const baseCache={};
function baselineOf(font){if(baseCache[font]!=null)return baseCache[font];
  const s=document.createElement('span');s.style.cssText=`position:absolute;visibility:hidden;font:${font};line-height:1;white-space:pre`;
  s.innerHTML='Hg<i style="display:inline-block;width:0;height:0;vertical-align:baseline"></i>';document.body.appendChild(s);
  const b=s.querySelector('i').offsetTop;s.remove();return baseCache[font]=b;}
const labels=[];
function placeLabel(e){e.style.top=(e.__y-baselineOf(e.__f))+'px';}
export function label(layer,x,y,text,o){
  const e=document.createElement('span');e.className='blabel';e.textContent=text;
  const font=`${o.weight||400} ${o.size}px ${o.family||'Figtree, sans-serif'}`;
  e.style.cssText=`left:${x-layout().minX}px;font:${font};color:${o.color||'#fff'};letter-spacing:${o.spacing||0}px;transform:translateX(${o.anchor==='middle'?'-50%':o.anchor==='end'?'-100%':'0'})`;
  e.__f=font;e.__y=y-layout().minY;placeLabel(e);layer.appendChild(e);labels.push(e);return e;}
/* once the game's fonts have loaded: measure the baselines again (the board may have been drawn with fallback fonts) */
export function relabel(){for(const k in baseCache)delete baseCache[k];for(let i=labels.length-1;i>=0;i--){if(!labels[i].isConnected){labels.splice(i,1);continue;}placeLabel(labels[i]);}}

let drawnMap=null,drawn='',DEFS=null;
/* the terrain the board shows: what buildBoard draws depends on this alone (a new deal on the same terrain, with other
   blockades, keeps the board; the blockade layer follows the deal itself) */
const terrainOf=M=>M.course+'|'+[...M.hexes.values()].map(h=>h.k+h.type+h.val+(h.sym||'')+(h.num||'')+h.tile+(M.tiles[h.tile].end?'e':'')).join()+'|'+M.conns.map(c=>c.edges.join(';')).join();
/* draw the board for MAP, once per terrain (starting the game shown on the start screen, or a new deal on the same
   course, costs no redraw) */
export function buildBoard(){
  if(drawnMap===MAP)return false;
  drawnMap=MAP;const t=terrainOf(MAP);if(drawn===t)return false;
  drawn=t;
  const svg=$('#board'),svg2=$('#board2'),lab=$('#blabels');
  for(const c of[...svg.children])if(c!==DEFS)c.remove(); // (the definitions never change: drawn once, kept)
  lab.innerHTML='';$('#blabels2').innerHTML=''; // (the overlay layers: boardLayers, below)
  for(const s of[svg,svg2]){s.setAttribute('width',layout().w);s.setAttribute('height',layout().h);s.setAttribute('viewBox',`${layout().minX} ${layout().minY} ${layout().w} ${layout().h}`);}
  for(const id of['#pieces','#bfx']){const e=$(id);e.style.width=layout().w+'px';e.style.height=layout().h+'px';}
  if(!DEFS)DEFS=drawDefs(svg);
  L.plates=sv('g',null,svg);L.terrain=sv('g',null,svg);L.city=sv('g',null,svg);
  boardLayers();
  // board plates (the physical boards): drop shadow + rim
  const byTile=new Map();for(const h of MAP.hexes.values()){if(!byTile.has(h.tile))byTile.set(h.tile,[]);byTile.get(h.tile).push(h);}
  for(const[,hs]of byTile){const g=sv('g',null,L.plates);for(const h of hs){const{x,y}=xy(h.k);sv('polygon',{points:hexPts(x+2,y+6,R+2),fill:'rgba(0,0,0,.45)'},g);}}
  for(const[t,hs]of byTile){const g=sv('g',null,L.plates);const rim=MAP.tiles[t].end?'#6b4c14':'#1c2a22';for(const h of hs){const{x,y}=xy(h.k);sv('polygon',{points:hexPts(x,y,R+2.2),fill:rim},g);}}
  for(const[t,hs]of byTile){const g=sv('g',null,L.plates);const inner=MAP.tiles[t].end?'#3a2a0b':'#0f1a14';for(const h of hs){const{x,y}=xy(h.k);sv('polygon',{points:hexPts(x,y,R+.6),fill:inner},g);}}
  // hexes
  for(const h of MAP.hexes.values()){
    const g=sv('g',null,L.terrain),{x,y}=xy(h.k);
    const pts=hexPts(x,y,R-1.4);
    const vt=h.type==='g'?h.sym:h.type; // El Dorado's finishing spaces look like the terrain they need (water or jungle)
    sv('polygon',{points:pts,fill:'url(#gr-'+vt+(TSHADE[vt]?Math.min(4,h.val):'')+')'},g);
    if(vt!=='m'&&vt!=='s'&&vt!=='g')sv('polygon',{points:pts,fill:'url(#p-'+vt+')'},g);
    sv('polygon',{points:pts,fill:'url(#hexShine)',stroke:'rgba(255,255,255,.16)','stroke-width':1},g);
    if(h.type==='m'){drawMountain(g,h,x,y);continue;}
    if(h.type==='s'){sv('circle',{cx:x,cy:y,r:13,fill:'none',stroke:'rgba(75,68,54,.35)','stroke-width':1.5,'stroke-dasharray':'3 3'},g);
      label(lab,x,y+6,h.num,{anchor:'middle',size:17,family:'Young Serif, Georgia, serif',color:ICOL.s});continue;}
    if(h.type==='g'){
      // a gold ring and gold lettering mark the finish; the space itself is its terrain's colour
      sv('polygon',{points:hexPts(x,y,R-5),fill:'none',stroke:'#f8dc97','stroke-width':2.2},g);
      const u=sv('use',{href:'#i-'+h.sym,x:x-9,y:y-2,width:18,height:18},g);u.style.color=ICOL[h.sym];
      label(lab,x,y-8,'FINISH',{anchor:'middle',size:8,weight:800,spacing:1.2,color:'#f8dc97'});continue;}
    const sym=h.type,n=h.val;
    // icons spaced out so the count reads at a glance: 1 · 2 side by side · 3 in a triangle · 4 in a square
    const at=ICON_AT[Math.min(4,n)],is=n===1?18:n===2?15:13.5;
    if(n<=2){const w=n===1?28:44;sv('rect',{x:x-w/2,y:y-12,width:w,height:24,rx:12,fill:CHIP[sym]},g);}
    else sv('circle',{cx:x,cy:y+(n===3?.4:0),r:n===3?19:19.5,fill:CHIP[sym]},g);
    for(const[dx,dy]of at){const u=sv('use',{href:'#i-'+sym,x:x+dx-is/2,y:y+dy-is/2,width:is,height:is},g);u.style.color=ICOL[sym];}
  }
  // seams between boards
  const seam=sv('g',{stroke:'rgba(0,0,0,.55)','stroke-width':2.4,'stroke-linecap':'round'},L.terrain);
  for(const c of MAP.conns)for(const[a,b]of c.edges){const[x1,y1,x2,y2]=edgeSeg(a,b);sv('line',{x1,y1,x2,y2},seam);}
  // city
  const C=layout().city;
  sv('circle',{cx:C.x,cy:C.y,r:R*2.6,fill:'url(#cityGlow)'},L.city);
  const cg=sv('g',{transform:`translate(${C.x},${C.y})`},L.city);
  for(let i=0;i<12;i++){const a=i*Math.PI/6;sv('line',{x1:Math.cos(a)*30,y1:Math.sin(a)*30-6,x2:Math.cos(a)*52,y2:Math.sin(a)*52-6,stroke:'rgba(255,214,107,.35)','stroke-width':2,'stroke-linecap':'round'},cg);}
  const steps=[[50,9],[40,9],[30,9],[20,9]];let y=22;
  sv('ellipse',{cx:0,cy:24,rx:30,ry:5,fill:'rgba(0,0,0,.35)'},cg);
  steps.forEach(([w,hh],i)=>{sv('rect',{x:-w/2,y:y-hh,width:w,height:hh,rx:1.5,fill:i%2?'#e9b440':'#f8d36c',stroke:'#8a5c10','stroke-width':1},cg);y-=hh;});
  sv('rect',{x:-6,y:y-11,width:12,height:11,fill:'#fbe08a',stroke:'#8a5c10','stroke-width':1},cg);
  sv('rect',{x:-2,y:y-7,width:4,height:7,fill:'#8a5c10'},cg);
  // the name goes beside the pyramid, across the line from the finishing spaces (C.d points away from them) to where
  // arrived explorers stand: never on either
  let px=-C.dy,py=C.dx;if(px<0||(Math.abs(px)<.35&&py<0)){px=-px;py=-py;}
  const side=px>.35;label(lab,C.x+(side?px*40+2:0),C.y+(side?py*40+5:44),'El Dorado',{anchor:side?'start':'middle',family:'Young Serif, Georgia, serif',size:15,color:'#f8dc97'});
  return true;
}
/* gradients, patterns and icons the board's shapes use: the same for every course */
function drawDefs(svg){
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
  return defs;
}
function drawMountain(g,h,x,y){
  const v=hash(h.q,h.r);
  const s=v>.5?1:-1;
  sv('path',{d:`M${x-21} ${y+12} L${x-8*s} ${y-12} L${x-2*s} ${y-2} L${x+7*s} ${y-16} L${x+21} ${y+12} Z`,fill:'#6d766e'},g);
  sv('path',{d:`M${x+7*s} ${y-16} L${x+21} ${y+12} L${x+4*s} ${y+12} Z`,fill:'rgba(0,0,0,.25)'},g);
  sv('path',{d:`M${x-8*s} ${y-12} L${x-2*s} ${y-2} L${x-6*s} ${y+12} L${x-14*s} ${y+12} Z`,fill:'rgba(0,0,0,.18)'},g);
  sv('path',{d:`M${x+7*s} ${y-16} L${x+2*s} ${y-7} L${x+6*s} ${y-8} L${x+9*s} ${y-4} L${x+11.5*s} ${y-9} Z`,fill:'#eef3ee'},g);
  sv('path',{d:`M${x-8*s} ${y-12} L${x-11*s} ${y-7} L${x-8*s} ${y-8} L${x-5*s} ${y-6.5} Z`,fill:'#eef3ee'},g);
}
export function edgeSeg(a,b){const A=xy(a),B=xy(b);const mx=(A.x+B.x)/2,my=(A.y+B.y)/2;let dx=B.x-A.x,dy=B.y-A.y;const l=Math.hypot(dx,dy);dx/=l;dy/=l;const px=-dy*R/2,py=dx*R/2;return[mx-px,my-py,mx+px,my+py];}

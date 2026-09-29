/* =========================================================
   MEEPLES — four explorer figures, one per player colour (crimson, ivory, violet, orange):
   0 man in a pith helmet, 1 woman in a wide-brim hat, 2 bearded man in a fedora,
   3 woman in a headscarf with a lantern. A faceted low-poly carved figure (meepleCarved) in the board's gradient + shine +
   dark-rim language, on a hex plinth (meepleBoardStyle).
   Board units (hex radius 34); feet/base centred near (0, 11), about 30 × 44 units.
   The whole figure is made of the player colour (shades mixed in JS); dark outline for every terrain.
   Plain polygons/paths only — no filters, no gradients.
   ========================================================= */
import { COLORS, assert } from '../engine.gen.js';
const MEEPLE_INK='#0d110f';
function meepleMix(hex,to,t){
  const n=parseInt(hex.slice(1),16),m=parseInt(to.slice(1),16);
  const ch=s=>{const a=(n>>s)&255,b=(m>>s)&255;return Math.round(a+(b-a)*t);};
  return'#'+((1<<24)|(ch(16)<<16)|(ch(8)<<8)|ch(0)).toString(16).slice(1);
}
const mpE=(tag,a)=>'<'+tag+Object.entries(a).map(([k,v])=>` ${k}="${v}"`).join('')+'/>';
// polygon / path with a crisp mitred outline (sw 0 = no outline)
const mpG=(pts,fill,sw=1.2,x={})=>mpE('polygon',{points:pts,fill,stroke:sw?MEEPLE_INK:'none','stroke-width':sw,'stroke-linejoin':'miter','stroke-miterlimit':6,...x});
const mpA=(d,fill,sw=1.2,x={})=>mpE('path',{d,fill,stroke:sw?MEEPLE_INK:'none','stroke-width':sw,'stroke-linejoin':'miter','stroke-miterlimit':6,...x});
const mpLine=(d,col,w,x={})=>mpE('path',{d,fill:'none',stroke:col,'stroke-width':w,'stroke-linecap':'square','stroke-linejoin':'miter',...x});
function meepleBadge(num,lt,x,y){
  if(!num)return'';
  const r=4.8,p=[0,1,2,3,4,5].map(i=>{const a=Math.PI/3*i+Math.PI/6;return(x+r*Math.cos(a)).toFixed(2)+','+(y+r*Math.sin(a)).toFixed(2);}).join(' ');
  return mpG(p,MEEPLE_INK,1,{stroke:lt})+`<text x="${x}" y="${y+2.5}" text-anchor="middle" font-size="7" font-weight="800" fill="#fff" font-family="Figtree, sans-serif">${num}</text>`;
}

/* ---------- A: carved, faceted wooden figurine ---------- */
function meepleCarved(v,K,plinth){
  const{c,lt,dk,dk2,skin,skinDk,hair}=K,woman=v===1||v===3;let s='';
  if(plinth)s+=plinth;else{
  // hexagonal prism base: sides (3 shaded facets) + top (2 facets)
  s+=mpG('-12.5,10.5 -6.5,14.2 6.5,14.2 12.5,10.5 12.5,13.8 6.5,17.5 -6.5,17.5 -12.5,13.8',dk2,1.4);
  s+=mpG('-12.5,10.5 -6.5,14.2 -6.5,17.5 -12.5,13.8','@m1',0);
  s+=mpG('-6.5,14.2 6.5,14.2 6.5,17.5 -6.5,17.5',dk,0);
  s+=mpG('-12.5,10.5 -6.5,6.8 6.5,6.8 12.5,10.5 6.5,14.2 -6.5,14.2',c,1.2);
  s+=mpG('-12.5,10.5 -6.5,6.8 6.5,6.8 12.5,10.5',lt,0);}
  // headscarf tails behind (v3)
  if(v===3)s+=mpG('5.6,-18 12,-14.8 9.4,-13.8 11.2,-10.4 6,-13.4','@d2',1.1);
  // legs + boots
  s+=mpA(woman?'M-4.4 6 L-0.8 6 L-1 10.2 L-4.2 10.2 Z M0.8 6 L4.4 6 L4.2 10.2 L1 10.2 Z':'M-5.2 3.6 L-0.8 3.6 L-1 10.2 L-4.6 10.2 Z M0.8 3.6 L5.2 3.6 L4.6 10.2 L1 10.2 Z','@d1',1.1);
  s+=mpA('M-5 8.2 L-0.8 8.2 L-0.8 11.6 L-6 11.6 Z M0.8 8.2 L5 8.2 L6 11.6 L0.8 11.6 Z','@d3',1.1);
  // arms (rolled sleeves on v2 show skin forearms)
  const aL='-7,-5.2 -10.4,3 -8,3.8 -5.4,-1.6',aR='7,-5.2 10.4,3 8,3.8 5.4,-1.6';
  if(v===2){s+=mpG(aL,skin,1.1)+mpG(aR,skinDk,1.1)+mpG('-7,-5.2 -8.8,-0.6 -6.2,0.2 -5.4,-1.6',lt,1.1)+mpG('7,-5.2 8.8,-0.6 6.2,0.2 5.4,-1.6',dk,1.1);}
  else s+=mpG(aL,lt,1.1)+mpG(aR,dk,1.1);
  s+=mpA('M-10.6 3 L-8.8 2 L-7.4 3.8 L-9.2 5.4 Z M10.6 3 L8.8 2 L7.4 3.8 L9.2 5.4 Z',skin,1);
  // torso: silhouette + light/dark planes
  const torso=woman?'-6,-5.2 -2.4,-6.4 2.4,-6.4 6,-5.2 5,-0.5 8.8,7.6 -8.8,7.6 -5,-0.5':'-7,-5.2 -2.6,-6.4 2.6,-6.4 7,-5.2 6,4.6 -6,4.6';
  if(woman){s+=mpG(torso,c,1.4);
    s+=mpG('-6,-5.2 -2.4,-6.4 -1.8,-0.5 -3.2,7.6 -8.8,7.6 -5,-0.5',lt,0)+mpG('6,-5.2 2.4,-6.4 1.8,-0.5 3.2,7.6 8.8,7.6 5,-0.5',dk,0);
    if(K.shine)s+=mpG(torso,K.shine,0);
    s+=mpG('-5.3,-1.8 5.3,-1.8 5,0.4 -5,0.4','@d2',1);}
  else{s+=mpG(torso,c,1.4);
    s+=mpG('-7,-5.2 -2.6,-6.4 -1.8,4.6 -6,4.6',lt,0)+mpG('7,-5.2 2.6,-6.4 1.8,4.6 6,4.6',dk,0);
    if(K.shine)s+=mpG(torso,K.shine,0);
    s+=mpG('-6.3,1.4 6.3,1.4 6.1,3.4 -6.1,3.4','@d2',1);}
  // props
  if(v===0){s+=mpLine('M-5.2 -5 L6 1.2','@d2',1.4);s+=mpG('3.8,1 10.6,1 10.4,7.8 4,7.8','@d1',1.1)+mpG('3.8,1 10.6,1 10.2,4.2 7.2,5.2 4.2,4.2','@c',.9);}
  if(v===1)s+=mpG('4,-10.4 7.6,-8.4 6.6,-5.8 8.4,-3.6 7.2,-1 8.6,1.6 7.2,4 5.8,1.6 6.2,-1 5,-3.6 5.4,-6',hair,1)+mpG('5.8,1.8 8.4,1.8 8.2,3.2 6,3.2',c,.8);
  if(v===2)s+=mpG('-3.2,-6.4 3.2,-6.4 0,-2',lt,1);
  if(v===3){s+=mpG('9.2,-1.4 13.6,3.4 9.2,11.4 4.8,3.4','#ffd66b',0,{opacity:.35});
    s+=mpLine('M7.8 3 L9.2 1 L10.6 3',MEEPLE_INK,.9);
    s+=mpG('7.4,3.2 11,3.2 11.8,5 11.4,9.2 7,9.2 6.6,5','@d2',1.1)+mpG('8.4,4.6 10,4.6 10.5,6 10.1,8 8.3,8 7.9,6','#ffe38a',0);}
  // head: faceted skin block, dark right plane
  s+=mpG('-6.2,-17.5 -5.2,-20.5 5.2,-20.5 6.2,-17.5 5.4,-10.6 2.4,-7.2 -2.4,-7.2 -5.4,-10.6',skin,1.4);
  s+=mpG('1,-20.5 5.2,-20.5 6.2,-17.5 5.4,-10.6 2.4,-7.2 0.6,-7.2 1.6,-12.4',skinDk,0);
  if(v===0)s+=mpG('-6.2,-16 -6.6,-11.8 -5.4,-10.6 -5.2,-15',hair,0)+mpG('6.2,-16 6.6,-11.8 5.4,-10.6 5.2,-15',hair,0);
  if(v===1||v===3)s+=mpA('M-6.2,-16 L-7.6,-9.2 L-5.2,-10.4 L-5,-15 Z M6.2,-16 L7.6,-9.2 L5.2,-10.4 L5,-15 Z',hair,1);
  if(v===2)s+=mpG('-5.6,-11.4 -2.6,-9.4 -1.2,-10.4 1.2,-10.4 2.6,-9.4 5.6,-11.4 5.2,-10.2 2.4,-6.2 -2.4,-6.2 -5.2,-10.2','@d2',1.1);
  s+=mpA('M-3.8 -13.6 h2.2 v1.2 h-2.2 Z M1.6 -13.6 h2.2 v1.2 h-2.2 Z',MEEPLE_INK,0);
  // hats
  if(v===0){s+=mpG('-8,-17.2 -7,-22.4 -3,-26.2 3,-26.2 7,-22.4 8,-17.2','@l1',1.4);
    s+=mpG('-8,-17.2 -7,-22.4 -3,-26.2 -1.6,-17.2','@l2',0)+mpG('3,-26.2 7,-22.4 8,-17.2 2,-17.2','@c',0);
    s+=mpG('-8,-17.4 8,-17.4 7.8,-19.6 -7.8,-19.6',dk,.9);
    s+=mpG('-11.6,-17.2 11.6,-17.2 8.6,-14.8 -8.6,-14.8','@l1',1.2);}
  if(v===1){s+=mpG('-6.4,-17 -5.4,-23.6 5.4,-23.6 6.4,-17','@l1',1.3)+mpG('1.4,-23.6 5.4,-23.6 6.4,-17 1.6,-17','@c',0);
    s+=mpG('-6.3,-17.2 6.3,-17.2 6.1,-19.4 -6.1,-19.4',c,.9);
    s+=mpG('-14.6,-17.2 14.6,-17.2 11,-14.4 -11,-14.4','@l1',1.3)+mpG('0,-17.2 14.6,-17.2 11,-14.4 0,-14.4','@c',0);}
  if(v===2){s+=mpG('-6.6,-17.2 -5.8,-23.8 -1.6,-25 0,-23.4 1.6,-25 5.8,-23.8 6.6,-17.2','@d1',1.3)+mpG('0,-23.4 1.6,-25 5.8,-23.8 6.6,-17.2 0.6,-17.2','@d2',0);
    s+=mpG('-6.5,-17.2 6.5,-17.2 6.3,-19.2 -6.3,-19.2','@d3',0);
    s+=mpG('-12.4,-18.8 -9,-16.8 9,-16.8 12.4,-18.8 9.6,-15 -9.6,-15','@d1',1.3);}
  if(v===3){s+=mpG('-6.8,-15.4 -6.2,-21 -2.6,-23.6 3,-23.6 6.6,-21 7,-15.4 4.8,-18.2 -4.8,-18.2','@d1',1.3);
    s+=mpG('1,-23.6 3,-23.6 6.6,-21 7,-15.4 4.8,-18.2 1.6,-18.2','@d2',0)+mpG('-6.2,-21 -2.6,-23.6 -0.6,-23.6 -4.8,-18.2 -6.8,-15.4',c,0)+mpLine('M-5.4 -19.4 L0 -21.8 L5.4 -19.4','@l1',.9);
    s+=mpG('5.2,-19 8,-17.6 6.8,-15 4.6,-16.2',dk2,1);}
  return s+meepleBadge(K.num,lt,-10.6,plinth?14:12.6);
}

/* ---------- B: travel-poster silhouette standee ---------- */
const MEEPLE_PLINTH=(()=>{
  const hx=(r,ry,cy)=>[[0,-1],[.866,-.5],[.866,.5],[0,1],[-.866,.5],[-.866,-.5]].map(([a,b])=>(a*r).toFixed(2)+','+(cy+b*ry).toFixed(2)).join(' ');
  const R=14.6,Y=5,C=10.2,T=2.8,x=(R*.866).toFixed(2),a=C+Y/2,b=C+Y;
  return{top:hx(R,Y,C),gold:hx(R*.72,Y*.72,C),left:`-${x},${a} 0,${b} 0,${b+T} -${x},${a+T}`,right:`0,${b} ${x},${a} ${x},${a+T} 0,${b+T}`,
    all:`0,${C-Y} ${x},${C-Y/2} ${x},${a+T} 0,${b+T} -${x},${a+T} -${x},${C-Y/2}`};
})();
function meepleDefsD(id,c){
  if(typeof document!=='undefined'&&document.getElementById(id+'b'))return'';
  const m=(t,to)=>meepleMix(c,to||'#ffffff',t),lg=(k,a,b)=>`<linearGradient id="${id}${k}" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  return'<defs>'+lg('b',m(.3),m(.22,'#000000'))+lg('l',m(.5),m(.2))+lg('d',m(.22,'#000000'),m(.5,'#000000'))+lg('f',m(.62),m(.34))+lg('p',m(.34),m(.3,'#000000'))
    +`<radialGradient id="${id}s" cx=".35" cy=".25" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`;
}
function meepleBoardStyle(v,K,c){
  const id='mpd'+c.slice(1)+'-',u=k=>`url(#${id}${k})`,rim=meepleMix(c,MEEPLE_INK,.8),H=MEEPLE_PLINTH;
  let b=meepleDefsD(id,c);
  b+=mpG(H.all,rim,2.2);
  b+=mpG(H.left,'@d1',0)+mpG(H.right,'@d2',0);
  b+=mpG(H.top,u('p'),0)+mpG(H.top,u('s'),0,{stroke:'rgba(255,255,255,.22)','stroke-width':.8});
  b+=mpG(H.gold,'none',0,{stroke:'#f8dc97','stroke-width':.7,opacity:.75});
  const s=meepleCarved(v,{...K,shine:u('s')},b);
  const R={c:u('b'),l1:u('l'),d1:u('d'),l2:u('f')};
  return s.replace(/@(c|l1|d1|l2)\b/g,(_,k)=>R[k]).split(MEEPLE_INK).join(rim);
}

// The art is drawn in roles; every role is a shade of the player colour, so the whole
// figure is made of its colour (like a miniature cast in one resin). Roles: l2 l1 c d1 d2 d3.
export function meepleSVG(c,num){
  const v=COLORS.findIndex(x=>x.hex===c);assert(v>=0,'meepleSVG: a player colour'); // one explorer figure per colour
  const P={m1:meepleMix(c,'#000000',.18),l2:meepleMix(c,'#ffffff',.55),l1:meepleMix(c,'#ffffff',.28),c,d1:meepleMix(c,'#000000',.3),d2:meepleMix(c,'#000000',.5),d3:meepleMix(c,'#000000',.68)};
  const K={c:'@c',num,lt:'@l1',dk:'@d1',dk2:'@d2',skin:'@l2',skinDk:'@l1',hair:'@d2'};
  return meepleBoardStyle(v,K,c).replace(/@(m1|l2|l1|c|d1|d2|d3)\b/g,(_,k)=>P[k]);
}
